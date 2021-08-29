# frozen_string_literal: true

class AuthenticationsController < Devise::OmniauthCallbacksController
  skip_before_action :assert_is_devise_resource!

  def facebook
    callback
  end

  def google_oauth2
    callback
  end

  def linkedin
    callback
  end

  def failure
    redirect_to root_path
  end

  private

  def callback
    # For login as a user, implement kind parameter
    # pp request.env['omniauth.params'] => {"kind"=>"candidate"}
    @candidate = Candidate.from_omniauth(request.env['omniauth.auth'])
    if @candidate.persisted?
      sign_in @candidate
      redirect_to candidate_candidate_dashboard_path
    else
      redirect_to new_candidate_registration_url
    end
  end
end
