class ApplicationController < ActionController::Base

  protect_from_forgery
  before_action :set_permissions
  layout :set_devise_layout

  add_flash_types :error, :success, :errors, :alert

  rescue_from Exception, with: :render_generic_exception if Rails.env.production?
  rescue_from ActionController::RoutingError, with: :render_not_found if Rails.env.production?
  rescue_from ActionController::UnknownController, with: :render_not_found if Rails.env.production?
  rescue_from AbstractController::ActionNotFound, with: :render_not_found if Rails.env.production?
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found if Rails.env.production?
  rescue_from StandardError,with: :render_not_found if Rails.env.production?
  rescue_from Exception::NoMethodError,with: :render_not_found if Rails.env.production?



  # before_filter :authenticate_user!

  def set_permissions
    session[:permissions] ||= current_user.permissions.uniq.collect(&:name) if current_user
  end

  def states
    render json: CS.states(params[:country].to_sym).to_json
  end

  def cities
    render json: CS.cities(params[:state].to_sym, params[:country].to_sym).map{ |k| [k.downcase.tr(" " , "_") , k] }.to_h.to_json
  end

  def set_devise_layout
    'static' if devise_controller?
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

  def render_exception(status = 500, message = 'An Error Occurred', exception)
    @status = status
    @message = message
    UserMailer.exception_notify(exception,exception.backtrace[0..25].join('\n'),params.inspect).deliver if Rails.env.production?
    render template: "shared/404", formats: [:html], layout: false
  end

  def render_generic_exception(exception)
    render_exception(500, exception.message, exception)
  end


  def render_not_found(exception = nil)
    render_exception(404, 'Not Found', exception)
  end

  def current_company
    @current_company = Company.find_by(slug: request.subdomain)
  end

  helper_method :current_company

end
