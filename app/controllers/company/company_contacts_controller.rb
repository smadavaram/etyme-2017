class Company::CompanyContactsController < Company::BaseController

  def index
    @company_contacts = current_company.company_contacts.paginate(page: params[:page], per_page: 11)
  end

end
