Jekyll::Hooks.register :site, :post_write do |site|
  puts "=== Running Pagefind ==="

  success = system("_bin/pagefind --site #{site.dest}")

  puts "=== Pagefind #{success ? 'SUCCESS' : 'FAILED'} ==="
end