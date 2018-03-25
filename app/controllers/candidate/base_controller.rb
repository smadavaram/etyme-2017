class Candidate::BaseController < ApplicationController
  before_filter :authenticate_candidate!
  layout 'candidate'
end
