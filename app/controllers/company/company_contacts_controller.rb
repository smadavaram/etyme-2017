class Company::CompanyContactsController < Company::BaseController

  before_action :set_comoany_contact, only: [:destroy]

  def index
    @company_contacts = current_company.company_contacts.paginate(page: params[:page], per_page: 11)
  end

  def new
  end

  def destroy
    if @company_contact.destroy
      flash[:success] = 'Company Contact has been destroyed'
      redirect_back(fallback_location: root_path)
    else
      flash[:errors] = 'Something went wrong'
      redirect_back(fallback_location: root_path)
    end
  end

  def create
    @company_contact = current_company.company_contacts.new(compnay_contact_params)
    respond_to do |format|
      if @company_contact.save
        format.js {flash.now[:success] = "Company Contacts Added successfully."}
        format.html {flash[:success] = "Company Contacts Added successfully."; redirect_to company_company_contacts_path}
      else
        format.js {flash.now[:errors] = @company_contact.errors.full_messages}
        format.html {flash[:errors] = @company_contact.errors.full_messages; render 'new'}
      end
    end
  end

  private

  def set_comoany_contact
    unless @company_contact = current_company.company_contacts.find_by(id: params[:id])
      flash[:errors] = 'Please Send a Valid Company Contact Id'
      redirect_back(fallback_location: root_path)
    end
  end

  def compnay_contact_params
    params.require(:company_contact).permit(:type, :first_name, :last_name, :email, :phone, :title, :department)
  end

end
