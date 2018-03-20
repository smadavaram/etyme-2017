class Company::CompanyContactsController < Company::BaseController

  def index
    @company_contacts = current_company.company_contacts.paginate(page: params[:page], per_page: 11)
  end

  def new
  end

  def create
    @company_contact = current_company.company_contacts.new(compnay_contact_params)
    if @company_contact.save
      flash[:success] = "Company Contacts Added successfully."
    else
      flash[:errors] = @company_contact.errors.full_messages
    end
  end

  private

  def compnay_contact_params
    params.require(:company_contact).permit(:type, :first_name, :last_name ,:email, :phone, :title, :department )
  end

end
