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
    
    binding.pry
    
    candidate = Candidate.find_by(id: current_candidate.id)
    if candidate.online_candidate_status == "offline" || candidate.online_candidate_status == nil
      candidate.update(online_candidate_status: "online")
    end
  end

  # DELETE /resource/sign_out
  def destroy
    candidate = current_candidate
    if candidate.online_candidate_status == "online"
        candidate.update(online_user_status: "offline")
    end
    super
  end

  # protected

  # If you have extra params to permit, append them to the sanitizer.
  # def configure_sign_in_params
  #   devise_parameter_sanitizer.permit(:sign_in, keys: [:attribute])
  # end
end
