# frozen_string_literal: true

class AuthenticationsController < Devise::OmniauthCallbacksController
  skip_before_action :assert_is_devise_resource!

  def facebook
    # TODO: Identify is a user or a candidate: Additional parameter? session variable
    @candidate = Candidate.from_omniauth(request.env['omniauth.auth'])
    if @candidate.persisted?
      sign_in @candidate
      redirect_to candidate_candidate_dashboard_path
    else
      session['devise.facebook_data'] = request.env['omniauth.auth'].except(:extra)
      redirect_to new_candidate_registration_url
    end
  end

  def failure
    redirect_to root_path
  end
end
