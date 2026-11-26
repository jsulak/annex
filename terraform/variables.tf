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

variable "droplet_image" {
  description = "Debian image slug for the Annex droplet. Changing it replaces an existing droplet."
  type        = string
  default     = "debian-12-x64"

  validation {
    condition     = contains(["debian-12-x64", "debian-13-x64"], var.droplet_image)
    error_message = "Use debian-12-x64 or debian-13-x64 for the droplet image."
  }
}
