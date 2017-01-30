class ApplicationController < ActionController::Base

  protect_from_forgery with: :exception

  layout :set_devise_layout

  # before_filter :authenticate_user!


  def states
    render json: CS.states(params[:country].to_sym).to_json
  end

  def cities
    render json: CS.cities(params[:state].to_sym, params[:country].to_sym).map{ |k| [k.downcase.tr(" " , "_") , k] }.to_h.to_json
  end

  def set_devise_layout
    'landing' if devise_controller?
  end

  def after_sign_in_path_for(resource)
    class_name = resource.class.name
    if session[:previous_url]
      return session[:previous_url]
    elsif class_name == 'Admin' || class_name=='Consultant' || class_name=='User'
      return dashboard_path
    elsif class_name=='Candidate'
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
