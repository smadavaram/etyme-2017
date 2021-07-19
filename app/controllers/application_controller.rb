# frozen_string_literal: true

class ApplicationController < ActionController::Base
  protect_from_forgery
  layout :set_devise_layout

  add_flash_types :error, :success, :errors, :alert

  rescue_from Exception, with: :render_generic_exception if Rails.env.production?
  rescue_from ActionController::RoutingError, with: :render_not_found if Rails.env.production?
  rescue_from ActionController::UnknownController, with: :render_not_found if Rails.env.production?
  rescue_from AbstractController::ActionNotFound, with: :render_not_found if Rails.env.production?
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found if Rails.env.production?
  rescue_from StandardError, with: :render_not_found if Rails.env.production?

  # before_filter :authenticate_user!

  def set_permissions
    session[:permissions] ||= current_user.permissions.uniq.collect(&:name) if current_user
  end

  def states
    render json: CS.states(params[:country].to_sym).to_json
  end

  def cities
    render json: CS.cities(params[:state].to_sym, params[:country].to_sym).map { |k| [k.downcase.tr(' ', '_'), k] }.to_h.to_json
  end

  def set_devise_layout
    if devise_controller? && action_name.eql?('new')
      'company_account'
    else
      'static'
    end
  end

  def after_sign_in_path_for(resource)
    return sadmin_dashboard_path if resource.is_a? AdminUser

    class_name = resource.class.name
    get_new_notification_flash(resource)
    prepare_exception_notifier
    set_permissions
    if session[:previous_url]
      session[:previous_url]
    elsif params[:allow_chat].present? && params[:allow_chat] == "true"
      company_conversations_path
    elsif %w[Admin Consultant User].include?(class_name)
      if resource.sign_in_count == 1
        company_path(current_company.id)
      else
        dashboard_path
      end
    elsif class_name == 'Candidate'
      '/candidate'
    else
      super
    end
  end

  def after_sign_out_path_for(resource_or_scope)
    url = request.protocol + request.domain + ":#{request.port}"

    return url if resource_or_scope.eql?(:admin_user)

    if resource_or_scope.eql?(:user)
      "#{url}/signin"
    elsif resource_or_scope.eql?(:candidate)
      super
    end
  end

  def get_new_notification_flash(resource)
    notifications_count = resource.notifications.unread.where('created_at >= ?', resource.last_sign_in_at).count
    messages_count = ConversationMessage.where(conversation_id: resource.conversations.pluck(:id)).where('created_at >= ?', resource.last_sign_in_at).count
    flash[:success] = notifications_count.zero? && messages_count.zero? ? 'Welcome back, You do not have any new notification or message' : "Welcome back, You have #{notifications_count} new notification(s) and #{messages_count} message(s)"
  end

  def render_exception(status = 500, message = 'An Error Occurred', exception)
    @status = status
    @message = message
    ExceptionNotifier.notify_exception(exception,
                                       data: { current_user: current_user, current_company: current_company })
    UserMailer.exception_notify(exception, exception.backtrace[0..25].join('\n'), params.inspect).deliver if Rails.env.production?
    render template: 'shared/404', formats: [:html], layout: false
  end

  def render_generic_exception(exception)
    render_exception(500, exception.message, exception)
  end

  def render_not_found(exception = nil)
    render_exception(404, 'Not Found', exception)
  end

  def user_or_admin(user)
    user.class.to_s == 'Candidate' ? :candidates : :users
  end

  def current_company
    # return Company.first if Rails.env.development?
    @current_company = Company.find_by(slug: request.subdomain)
  end

  def prepare_exception_notifier
    request.env['exception_notifier.exception_data'] = {
      current_user: current_user,
      current_company: current_company
    }
  end
  helper_method :current_company
end
