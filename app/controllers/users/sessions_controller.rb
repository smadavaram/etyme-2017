# frozen_string_literal: true

class Users::SessionsController < Devise::SessionsController
  # before_action :configure_sign_in_params, only: [:create]

  include DomainExtractor

  layout 'company_account'
  add_breadcrumb 'Home', '/'
  add_breadcrumb 'Company', ''
  add_breadcrumb 'Sign In', ''
  before_action :set_company, only: %i[create]

  # GET /resource/sign_in
  def new
    if request.subdomain.present?
      super
    else
      flash[:error] = "You can't sign in without your company Domain"
      redirect_to '/'
    end
  end

  # POST /resource/sign_in
  def create
    if check_company_user
      super
      cookies.permanent.signed[:userid] = resource.id if resource.present?
      user = User.find_by(id: current_user.id)
      if user.online_user_status == "offline" || user.online_user_status == nil
        user.update(online_user_status: "online")
      end
    else
      flash[:error] = 'User is not registerd on this domain'
      redirect_back fallback_location: root_path
    end
  end

  # DELETE /resource/sign_out
  def destroy
    if user.online_user_status == "online"
        user.update(online_user_status: "offline")
    end
    sign_out(current_user)
    flash[:success] = 'You are logged out successfully.'

    redirect_to "#{request.base_url}/users/login"
  end

  # protected

  # If you have extra params to permit, append them to the sanitizer.
  # def configure_sign_in_params
  #   devise_parameter_sanitizer.permit(:sign_in, keys: [:attribute])
  # end

  private

  def check_company_user
    if current_company.users.find_by(email: (params[:user][:email]).downcase).present?
      true
    elsif params[:user][:email].match(/@([a-zA-Z]+)./)[1].eql?(current_company.slug)
      current_company.users.create(
        email: params[:user][:email],
        company_id: current_company.id,
        password: "passpass#{rand(999)}",
        password_confirmation: "passpass#{rand(999)}"
      )
      u = User.where(email: params[:user][:email]).first
      u.send_reset_password_instructions
      flash[:error] = "Looks like Team #{current_company.domain.capitalize} is registered with us but you are missing all the action. Check your email to activate the account and get started"
    else
      false
    end
  end

  def set_company
    redirect_to new_user_session_path, error: 'Company Not Found' unless current_company
  end
end
