# frozen_string_literal: true

class Candidates::RegistrationsController < Devise::RegistrationsController
  include DomainExtractor
  include Rewardful

  # before_action :configure_sign_up_params, only: [:create]
  # before_action :configure_account_update_params, only: [:update]
  before_action :configure_permitted_parameters

  layout 'company_account'
  add_breadcrumb 'Home', '/'
  add_breadcrumb 'Candidate', ''
  add_breadcrumb 'Sign Up', ''
  # GET /resource/sign_up
  def new
    super
  end

  # POST /resource
  def create
    # resource.invitsde!(configure_permitted_parameters , current_user)

    candidate_domain = domain_from_email(sign_up_params[:email])

    unless FreeEmailProvider.exists?(domain_name: candidate_domain)
      flash[:notice] = "#{candidate_domain} is a work email. Please use your personal public email!"
      redirect_to new_candidate_registration_path
      return
    end
    affiliate_check = {"affiliate_check" => params["candidate"]["affiliate_check"]}
    build_resource(sign_up_params.merge(affiliate_check))

    resource.save
    if params["candidate"]["affiliate_check"].present?
      data = create_affliate(params["candidate"])
      resource.update_columns(:affiliate_id=>data[:affiliate_id] , :affiliate_token=>data[:affiliate_token] )

    end

    yield resource if block_given?

    if resource.persisted?
      if resource.active_for_authentication?
        set_flash_message! :notice, :signed_up
        sign_up(resource_name, resource)
        respond_with resource, location: after_sign_up_path_for(resource)
      else
        set_flash_message! :notice, :"signed_up_but_#{resource.inactive_message}"
        expire_data_after_sign_in!
        respond_with resource, location: after_inactive_sign_up_path_for(resource)
      end
    else
      flash[:errors] = resource.errors.full_messages
      clean_up_passwords resource
      set_minimum_password_length
      respond_with resource
    end
    # Candidate.invite!(current_user)
  end

  # GET /resource/edit
  # def edit
  #   super
  # end

  # PUT /resource
  # def update
  #   super
  # end

  # DELETE /resource
  # def destroy
  #   super
  # end

  # GET /resource/cancel
  # Forces the session data which is usually expired after sign
  # in to be expired now. This is useful if the user wants to
  # cancel oauth signing in/up in the middle of the process,
  # removing all OAuth session data.
  # def cancel
  #   super
  # end

  # protected

  # If you have extra params to permit, append them to the sanitizer.
  # def configure_sign_up_params
  #   devise_parameter_sanitizer.permit(:sign_up, keys: [:attribute])
  # end

  # If you have extra params to permit, append them to the sanitizer.
  # def configure_account_update_params
  #   devise_parameter_sanitizer.permit(:account_update, keys: [:attribute])
  # end

  # The path used after sign up.
  def after_sign_up_path_for(_resource)
    new_candidate_session_path
  end

  # The path used after sign up for inactive accounts.
  def after_inactive_sign_up_path_for(_resource)
    new_candidate_session_path
  end

  protected

  # my custom fields are :first_name, :last_name
  def configure_permitted_parameters
    devise_parameter_sanitizer.permit(:sign_up) do |u|
      u.permit(
        :first_name,
        :last_name,
        :email,
        :invited_by,
        :invited_by_id,
        :invitation_type,
        :invited_by_type,
        :job_id,
        :expiry,
        :message,
        :password,
        :password_confirmation)
    end

    devise_parameter_sanitizer.permit(:account_update) do |u|
      u.permit(
        :first_name,
        :last_name,
        :email,
        :password,
        :password_confirmation,
        :current_password)
    end
  end
end
