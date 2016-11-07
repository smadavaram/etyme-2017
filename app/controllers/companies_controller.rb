class CompaniesController < ApplicationController

  before_action :set_new_company , only: [:new]
  before_action :build_new_company_owner , only: [:new]
  skip_before_action :authenticate_user! , only:[:new , :create]
  layout 'login'

  def new
  end

  def create
    @company = Company.new(company_params)
    if @company.valid?
      @company.save
      flash[:success] =  "Registration Successfull."
    else
      flash.now[:errors] = @company.errors.full_messages
      return render 'new'
    end
  end

  private

  def set_new_company
    @company = Company.new
  end

  def build_new_company_owner
    @company.build_owner
  end


  def company_params
    params.require(:company).permit(:name , owner_attributes:[:id, :type ,:first_name, :last_name, :email,:password, :password_confirmation])
  end
end
