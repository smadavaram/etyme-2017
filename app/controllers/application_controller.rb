class ApplicationController < ActionController::Base

  protect_from_forgery with: :exception

  layout :set_devise_layout

  before_filter :authenticate_user!
  before_action :verify_company #if Rails.env.production?


  def set_devise_layout
    'login' if devise_controller?
  end

  def after_sign_in_path_for(resource)
    if session[:previous_url]
      return session[:previous_url]
    elsif resource.class.name == 'HiringManager' || resource.class.name == 'Vendor'
      return dashboard_path
    else
      super
    end
  end # End of after_sign_in_path_for

  def verify_company
    if request.subdomain.present? && request.subdomain !='www' && request.subdomain !='app-etyme' && Company.where(slug: request.subdomain).blank?
      return redirect_to HOSTNAME
    end
  end #End of verify_company

  def current_company
    @company ||= Company.where(slug: request.subdomain).first
  end
  helper_method :current_company

end
