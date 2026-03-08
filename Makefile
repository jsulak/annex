TERRAFORM_DIR = terraform
ANSIBLE_DIR = ansible
APP_USER ?= annex
DOMAIN ?=
EXTRA_VARS := $(if $(DOMAIN),-e "domain=$(DOMAIN)",)

# Get the droplet IP from Terraform
IP := $(shell cd $(TERRAFORM_DIR) && terraform output -raw droplet_ip 2>/dev/null)

.PHONY: infra-init infra-plan infra-apply infra-destroy provision deploy push setup wait-for-ssh

## Terraform — expects DIGITALOCEAN_TOKEN env var
infra-init:
	cd $(TERRAFORM_DIR) && terraform init

infra-plan:
	cd $(TERRAFORM_DIR) && terraform plan

infra-apply:
	cd $(TERRAFORM_DIR) && terraform apply

infra-destroy:
	cd $(TERRAFORM_DIR) && terraform destroy

## Wait for SSH to become available on a fresh droplet
wait-for-ssh:
	@test -n "$(IP)" || (echo "Error: No droplet IP. Run 'make infra-apply' first." && exit 1)
	@echo "Waiting for SSH on $(IP)..."
	@for i in $$(seq 1 30); do \
		ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes \
			-i ~/.ssh/$(TF_VAR_ssh_key_name) root@$(IP) true 2>/dev/null && exit 0; \
		sleep 2; \
	done; echo "Error: SSH not available after 60s" && exit 1

## Ansible
# Provision: first run uses root (FIRST_RUN=1), subsequent runs use annex with sudo.
#   First time:  FIRST_RUN=1 make provision
#   After that:  make provision
provision:
	@test -n "$(IP)" || (echo "Error: No droplet IP. Run 'make infra-apply' first." && exit 1)
	@test -n "$(TF_VAR_ssh_key_name)" || (echo "Error: TF_VAR_ssh_key_name env var is required." && exit 1)
ifdef FIRST_RUN
	cd $(ANSIBLE_DIR) && ANSIBLE_HOST_KEY_CHECKING=false ansible-playbook provision.yml -i '$(IP),' -u root --private-key=~/.ssh/$(TF_VAR_ssh_key_name) $(EXTRA_VARS)
else
	cd $(ANSIBLE_DIR) && ansible-playbook provision.yml -i '$(IP),' -u $(APP_USER) --private-key=~/.ssh/$(TF_VAR_ssh_key_name) $(EXTRA_VARS)
endif

# Deploy runs as the app user (annex).
deploy:
	@test -n "$(IP)" || (echo "Error: No droplet IP. Run 'make infra-apply' first." && exit 1)
	@test -n "$(SESSION_SECRET)" || (echo "Error: SESSION_SECRET env var is required." && exit 1)
	@test -n "$(TF_VAR_ssh_key_name)" || (echo "Error: TF_VAR_ssh_key_name env var is required." && exit 1)
	cd $(ANSIBLE_DIR) && ansible-playbook deploy.yml -i '$(IP),' -u $(APP_USER) --private-key=~/.ssh/$(TF_VAR_ssh_key_name) -e "session_secret=$(SESSION_SECRET)"

# Quick code push — build locally, rsync, restart. Skips npm ci and PM2 config templating.
push:
	@test -n "$(IP)" || (echo "Error: No droplet IP. Run 'make infra-apply' first." && exit 1)
	@test -n "$(TF_VAR_ssh_key_name)" || (echo "Error: TF_VAR_ssh_key_name env var is required." && exit 1)
	npm run build
	rsync -az --delete \
		--exclude=node_modules --exclude=.git --exclude=.env \
		--exclude=ansible --exclude=terraform --exclude=test \
		--exclude=e2e --exclude=src \
		-e "ssh -i $$HOME/.ssh/$(TF_VAR_ssh_key_name)" \
		./ $(APP_USER)@$(IP):/opt/annex/
	ssh -i ~/.ssh/$(TF_VAR_ssh_key_name) $(APP_USER)@$(IP) "cd /opt/annex && pm2 restart ecosystem.config.cjs"

# Set the app password (interactive, first time only).
setup:
	@test -n "$(IP)" || (echo "Error: No droplet IP. Run 'make infra-apply' first." && exit 1)
	@test -n "$(TF_VAR_ssh_key_name)" || (echo "Error: TF_VAR_ssh_key_name env var is required." && exit 1)
	ssh -t -i ~/.ssh/$(TF_VAR_ssh_key_name) $(APP_USER)@$(IP) "cd /opt/annex && NODE_ENV=production NOTES_DIR=/home/annex/notes node dist/server/setup.js"
