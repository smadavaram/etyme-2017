# frozen_string_literal: true

class Candidate::BaseController < ApplicationController
  before_action :authenticate_candidate!, except: [:candidate_review, :save_review]
  layout 'candidate'
end
