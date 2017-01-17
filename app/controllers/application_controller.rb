class ApplicationController < ActionController::Base

  protect_from_forgery with: :exception

  layout :set_devise_layout

  # before_filter :authenticate_user!


  def states
    render json: CS.states(params[:country].to_sym).to_json
  end

  def cities
    render json: CS.cities(params[:state].to_sym, params[:country].to_sym).to_json
  end

  def set_devise_layout
    'login' if devise_controller?
  end

  def after_sign_in_path_for(resource)
    if session[:previous_url]
      return session[:previous_url]
    elsif resource.class.name == 'Admin'
      return dashboard_path
    elsif resource.class.name=='Candidate'
      return '/candidate'
    else
      super
    end
  end


  def current_company
    @company ||= Company.where(slug: request.subdomain).first if request.subdomain.present?
  end
  helper_method :current_company

end
