# frozen_string_literal: true

# == Schema Information
#
# Table name: job_requirements
#
#  id              :bigint           not null, primary key
#  job_id          :bigint
#  questions       :text
#  ans_type        :string
#  ans_mandatroy   :boolean
#  multiple_ans    :boolean
#  multiple_option :string
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
class JobRequirement < ApplicationRecord
  belongs_to :job
  has_many :job_applicant_reqs
end
