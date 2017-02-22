class CompaniesController < ApplicationController

  skip_before_action :authenticate_user!  ,          only:[:new , :create , :signup_success]
  before_action :find_company             ,          only: :profile

  respond_to :html,:json

  layout 'landing'

  add_breadcrumb "Home",'/'
  def new
    add_breadcrumb "Company",""
    add_breadcrumb "Sign Up",''
    @company = Company.new
    @company.build_owner(type: 'Admin')
  end

  def create
    @company = Company.new(company_params)
    if @company.save
      flash[:success] =  "Registration Successfull."
      render 'companies/signup_success' , layout: 'login'
    else
      flash.now[:errors] = @company.errors.full_messages
      return render 'new'
    end
  end

  def profile
    add_breadcrumb @company.name.titleize,"#"
    render layout: 'company'
  end

  private

  def find_company
    @company = Company.find(params[:id]);
    @new_company = @company
    if @company.invited_by.present?
      @company_contacts = current_company.invited_companies.find_by(invited_company_id: params[:id]).try(:invited_company).try(:company_contacts).paginate(:page => params[:page], :per_page => 20) || []
    end
  end

  def company_params
    params.require(:company).permit(:name ,:company_type,:domain, :website,:logo,:description,:phone,:email,:linkedin_url,:facebook_url,:twitter_url,:google_url,:is_activated,:status,:tag_line,
                                    owner_attributes:[:id, :type  , :first_name, :last_name ,:email,:password, :password_confirmation],
                                    locations_attributes:[:id,:name,:status,
                                                          address_attributes:[:id,:address_1,:country,:city,:state,:zip_code] ] )
  end
end
