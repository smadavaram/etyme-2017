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

  def add_to_group
    if params[:contacts][:ids].blank?
      flash[:errors] = 'No contacts selected!'
    elsif params[:contacts][:group_ids].reject(&:blank?).blank?
      flash[:errors] = 'No groups selected!'
    else
      params[:contacts][:ids].split(',').each do |c_id|
        company_contact = CompanyContact.find(c_id.to_i)
        company_contact.update_attribute(:group_ids, params[:contacts][:group_ids])
      end
      flash[:success] = 'Groups Assigned to selected contacts.'
    end
    redirect_back fallback_location: root_path
  end
end
