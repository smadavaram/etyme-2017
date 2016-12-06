class Company::BaseController < ApplicationController
  before_filter :authenticate_user!
  layout 'company'

  def current_company
    @company ||= Company.where(slug: request.subdomain).first
  end
  helper_method :current_company

end