class Candidate::BaseController < ApplicationController

  before_filter :authenticate_candidate!

  layout 'candidate'

  def current_candidate
    current_user
  end

  helper_method :current_candidate
  
end
