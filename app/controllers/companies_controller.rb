class CompaniesController < ApplicationController

  #CallBacks
  before_action :set_new_company_and_owner , only: [:new]
  skip_before_action :authenticate_user! , only:[:new , :create]

  #Layout
  layout 'login'

  def new
  end # End of new

  def create
    @company = Company.new(company_params)
    if @company.valid?
      @company.save
      flash[:success] =  "Registration Successfull."
    else
      flash.now[:errors] = @company.errors.full_messages
      return render 'new'
    end
  end # End of create

  private

    def set_new_company_and_owner
      @company = Company.new
      @company.build_owner
    end #End of set_new_company_and_owner

    def company_params
      params.require(:company).permit(:name , owner_attributes:[:id, :type ,:first_name, :last_name, :gender ,:email,:password, :password_confirmation])
    end # End of company_params
end
