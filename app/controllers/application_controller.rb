class ApplicationController < ActionController::Base
  # Prevent CSRF attacks by raising an exception.
  # For APIs, you may want to use :null_session instead.
  protect_from_forgery with: :exception
  before_filter :authenticate_user!
  layout :set_devise_layout

  before_action :verify_company if Rails.env.production?


  def set_devise_layout
    if devise_controller?
      'login'
    end
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
    if request.subdomain.present? && request.subdomain !='www' && Company.where(slug: request.subdomain).blank?
      return redirect_to HOSTNAME
    end
  end #End of verify_company

  def current_company
    @company ||= Company.where(slug: request.subdomain).first
  end
  helper_method :current_company
end
