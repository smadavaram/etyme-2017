# frozen_string_literal: true

class JobRequirement < ApplicationRecord
  belongs_to :job
  has_many :job_applicant_reqs
end
