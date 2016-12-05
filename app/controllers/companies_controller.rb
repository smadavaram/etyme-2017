class CompaniesController < ApplicationController

  #CallBacks
  before_action :set_new_company_and_owner , only: [:new]
  skip_before_action :authenticate_user! , only:[:new , :create , :signup_success]
  respond_to :html,:json

  #Layout
  layout 'login'


  def new
  end # End of new

  def create
    @company = Company.new(company_params)
    if @company.valid?
      @company.save
      flash[:success] =  "Registration Successfull."
      render 'companies/signup_success' , layout: 'login'
    else
      flash.now[:errors] = @company.errors.full_messages
      return render 'new'
    end
  end # End of create

  private

    def set_new_company_and_owner
      @company = Company.new
      @company.build_owner(type: 'Admin')
    end #End of set_new_company_and_owner

    def company_params
      params.require(:company).permit(:name ,:company_type, :website,:logo,:description,:phone,:email,:linkedin_url,:facebook_url,:twitter_url,:google_url,:is_activated,:status,:time_zone,:tag_line, owner_attributes:[:id, :type ,:first_name, :last_name ,:email,:password, :password_confirmation],locations_attributes:[:id,:name,:status,  address_attributes:[:id,:address_1,:country,:city,:state,:zip_code] ] )
    end # End of company_params
end
