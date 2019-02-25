namespace :onetime do
  desc "Generates permissions"
  task generate_permissions: :environment do
    puts 'Generating Permissions....'
    permissions = ["manage_consultants","manage_jobs","manage_vendors","send_job_invitations","manage_job_invitations","manage_job_applications","create_new_contracts","show_contracts_details","edit_contracts_terms", "manage_timesheets", "show_invoices", "manage_leaves"]

    permissions.each do |permission_name|
      Permission.create!(name: permission_name)
    end
    puts 'Permissions generated Successfully !!'
  end

end
