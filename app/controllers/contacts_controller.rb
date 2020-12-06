class ContactsController < Company::BaseController

  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'Import Contact(s)'
    puts "current_user=#{current_user.inspect}"
  end

  def import_contacts
    @contacts = request.env['omnicontacts.contacts']
    puts "------@contacts=#{@contacts.inspect}-------"
    @user = request.env['omnicontacts.user']
    puts "List of contacts of #{@user[:name]} obtained from #{params[:importer]}:"
    @contacts.each do |contact|
      puts "Contact found: name => #{contact[:name]}, email => #{contact[:email]}"
    end
  end

end
