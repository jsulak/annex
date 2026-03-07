output "droplet_ip" {
  description = "Public IP of the ZettelWeb droplet"
  value       = digitalocean_droplet.zettelweb.ipv4_address
}
