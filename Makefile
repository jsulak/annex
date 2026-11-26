TERRAFORM_DIR = terraform
ANSIBLE_DIR = ansible
APP_USER ?= annex
PROVISION_USER ?= annex-admin
DOMAIN ?=
EXTRA_VARS := $(if $(DOMAIN),-e "domain=$(DOMAIN)",)
ANSIBLE_PLAYBOOK = ANSIBLE_HOST_KEY_CHECKING=true ansible-playbook --ssh-common-args="-o StrictHostKeyChecking=yes"
export DOMAIN

# Read the saved IP only for targets that use it.
IP ?= $(shell cd $(TERRAFORM_DIR) && terraform output -raw droplet_ip 2>/dev/null)

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
	@echo "Waiting for verified SSH on $(IP)..."
	@for i in $$(seq 1 30); do \
		ssh -o StrictHostKeyChecking=yes -o ConnectTimeout=5 -o BatchMode=yes \
			-i ~/.ssh/$(TF_VAR_ssh_key_name) root@$(IP) true 2>/dev/null && exit 0; \
		sleep 2; \
	done; echo "Error: Verified SSH unavailable. Check connectivity and the pinned host key." && exit 1

## Ansible
# Provision requires a privileged SSH user. The app user is intentionally not sudo-capable.
#   First time:  FIRST_RUN=1 make provision
#   Later privileged changes: make provision (defaults to annex-admin)
provision:
	@test -n "$(IP)" || (echo "Error: No droplet IP. Run 'make infra-apply' first." && exit 1)
	@test -n "$(TF_VAR_ssh_key_name)" || (echo "Error: TF_VAR_ssh_key_name env var is required." && exit 1)
	cd $(ANSIBLE_DIR) && $(ANSIBLE_PLAYBOOK) provision.yml -i '$(IP),' \
		-u "$(if $(FIRST_RUN),root,$(PROVISION_USER))" --private-key="$$HOME/.ssh/$(TF_VAR_ssh_key_name)" $(EXTRA_VARS)

# Deploy runs as the app user (annex).
deploy:
	@test -n "$(IP)" || (echo "Error: No droplet IP. Run 'make infra-apply' first." && exit 1)
	@test "$${#SESSION_SECRET}" -ge 32 || (echo "Error: Export SESSION_SECRET with at least 32 characters." && exit 1)
	@test -n "$(TF_VAR_ssh_key_name)" || (echo "Error: TF_VAR_ssh_key_name env var is required." && exit 1)
	@unset DIGITALOCEAN_TOKEN TF_VAR_do_token OPENAI_API_KEY; \
		cd $(ANSIBLE_DIR) && $(ANSIBLE_PLAYBOOK) deploy.yml -i '$(IP),' -u "$(APP_USER)" --private-key="$$HOME/.ssh/$(TF_VAR_ssh_key_name)"

# The private wrapper's push command uses the same artifact deployment.
push: deploy

# Set the app password (interactive, first time only).
setup:
	@test -n "$(IP)" || (echo "Error: No droplet IP. Run 'make infra-apply' first." && exit 1)
	@test -n "$(TF_VAR_ssh_key_name)" || (echo "Error: TF_VAR_ssh_key_name env var is required." && exit 1)
	ssh -t -o StrictHostKeyChecking=yes -i ~/.ssh/$(TF_VAR_ssh_key_name) $(APP_USER)@$(IP) "cd /opt/annex && NODE_ENV=production NOTES_DIR=/home/annex/notes node dist/server/setup.js"
