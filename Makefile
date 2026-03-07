TERRAFORM_DIR = terraform
ANSIBLE_DIR = ansible

# Get the droplet IP from Terraform
IP := $(shell cd $(TERRAFORM_DIR) && terraform output -raw droplet_ip 2>/dev/null)

.PHONY: infra-init infra-plan infra-apply infra-destroy provision deploy

## Terraform — expects DIGITALOCEAN_TOKEN env var
infra-init:
	cd $(TERRAFORM_DIR) && terraform init

infra-plan:
	cd $(TERRAFORM_DIR) && terraform plan

infra-apply:
	cd $(TERRAFORM_DIR) && terraform apply

infra-destroy:
	cd $(TERRAFORM_DIR) && terraform destroy

## Ansible
# Provision runs as root (first-time setup). Disables host key checking
# because the droplet is brand new and not yet in known_hosts.
# After provision completes, root login is disabled — all further access
# is via the zettelweb user.
provision:
	@test -n "$(IP)" || (echo "Error: No droplet IP. Run 'make infra-apply' first." && exit 1)
	@test -n "$(TF_VAR_ssh_key_name)" || (echo "Error: TF_VAR_ssh_key_name env var is required." && exit 1)
	ANSIBLE_HOST_KEY_CHECKING=false cd $(ANSIBLE_DIR) && ansible-playbook provision.yml -i '$(IP),' -u root --private-key=~/.ssh/$(TF_VAR_ssh_key_name)

# Deploy runs as the app user (zettelweb), not root.
deploy:
	@test -n "$(IP)" || (echo "Error: No droplet IP. Run 'make infra-apply' first." && exit 1)
	@test -n "$(SESSION_SECRET)" || (echo "Error: SESSION_SECRET env var is required." && exit 1)
	@test -n "$(TF_VAR_ssh_key_name)" || (echo "Error: TF_VAR_ssh_key_name env var is required." && exit 1)
	cd $(ANSIBLE_DIR) && ansible-playbook deploy.yml -i '$(IP),' -u $(APP_USER) --private-key=~/.ssh/$(TF_VAR_ssh_key_name) -e "session_secret=$(SESSION_SECRET)"

APP_USER ?= zettelweb
