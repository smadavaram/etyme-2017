# frozen_string_literal: true

class Candidate::BaseController < ApplicationController
  before_action :authenticate_candidate!
  layout 'candidate'
end
