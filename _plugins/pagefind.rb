Jekyll::Hooks.register :site, :post_write do |site|
  if Jekyll.env == "production"
    puts "=== Running Pagefind ==="
    success = system("_bin/pagefind --site #{site.dest}")
    puts "=== Pagefind #{success ? 'SUCCESS' : 'FAILED'} ==="
  else
    puts "=== Skipping Pagefind in development environment ==="
  end
end