output "droplet_ip" {
  description = "Public IP of the Annex droplet"
  value       = digitalocean_droplet.annex.ipv4_address
}
