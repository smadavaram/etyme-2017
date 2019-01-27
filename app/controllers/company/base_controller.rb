class Company::BaseController < ApplicationController
  before_action :authenticate_user!
  before_action :verify_company
  layout 'company'


  def has_access?(permission)
    if current_user.has_permission(permission) || current_user.is_owner?
      true
    else
      flash[:notice] = "You are not Authorized to Acess this Page"
      redirect_to dashboard_path
    end
  end

  helper_method :current_user

  private
  def verify_company
    # if request.subdomain.present? && request.subdomain !='www' && request.subdomain !='app-etyme' && Company.where(domain: request.subdomain).blank?
    if request.subdomain.present? && request.subdomain !='www' && request.subdomain !='app-etyme' && Company.where(domain: request.subdomain).blank?
      return redirect_to HOSTNAME
    end
  end

end
