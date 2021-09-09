# frozen_string_literal: true

class Candidates::SessionsController < Devise::SessionsController
  # before_action :configure_sign_in_params, only: [:create]

  layout 'company_account'
  add_breadcrumb 'Home', '/'
  add_breadcrumb 'Candidate', ''
  add_breadcrumb 'Sign In', ''

  # GET /resource/sign_in
  def new
    super
  end

  # POST /resource/sign_in
  def create
    super
    cookies.permanent.signed[:candidateid] = resource.id if resource.present?
    ActionCable.server.broadcast("online_channel", id: current_candidate.id, type: "candidate", current_status:"login")
  end

  # DELETE /resource/sign_out
  # def destroy
  #   super
  # end

  # protected

  # If you have extra params to permit, append them to the sanitizer.
  # def configure_sign_in_params
  #   devise_parameter_sanitizer.permit(:sign_in, keys: [:attribute])
  # end
end
