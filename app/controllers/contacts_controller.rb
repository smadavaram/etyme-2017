class ContactsController < Company::BaseController

  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'Import Contact(s)'
    puts "current_user=#{current_user.inspect}"
  end

  def import_contacts
    @contacts = request.env['omnicontacts.contacts']
    @user = request.env['omnicontacts.user']
    puts "List of contacts of #{@user[:name]} obtained from #{params[:importer]}:"
    ImportContactsJob.perform_later(@contacts, current_company.id, current_user.id)
    flash[:success] = 'Import Contacts process has been started.Please check candidate or contacts section after sometime.'
  end

end
