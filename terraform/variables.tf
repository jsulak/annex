variable "do_token" {
  description = "DigitalOcean API token (set via DIGITALOCEAN_TOKEN or TF_VAR_do_token env var)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "ssh_key_name" {
  description = "Name of the SSH key in DigitalOcean (must already exist)"
  type        = string
}

variable "region" {
  description = "DigitalOcean region"
  type        = string
  default     = "nyc1"
}
