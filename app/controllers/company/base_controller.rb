class Company::BaseController < ApplicationController
  before_filter :authenticate_user!
  before_action :verify_company
  layout 'company'



  private
  def verify_company
    if request.subdomain.present? && request.subdomain !='www' && request.subdomain !='app-etyme' && Company.where(slug: request.subdomain).blank?
      return redirect_to HOSTNAME
    end
  end

end