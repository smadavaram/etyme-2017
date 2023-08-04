# frozen_string_literal: true

# == Schema Information
#
# Table name: candidates_resumes
#
#  id           :bigint           not null, primary key
#  candidate_id :integer
#  resume       :string
#  is_primary   :boolean          default(FALSE)
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#
class CandidatesResume < ApplicationRecord
  belongs_to :candidate, optional: true
  # after_save :build_archilli_profile
  after_save :build_openai_profile
  # after_save :build_sovren_profile
  scope :primary_resume, -> { where(is_primary: true).first }

  def build_archilli_profile
    if candidate.first_resume?
      response = ResumeParser.new(resume).binary_parse
      candidate.build_profile(JSON.parse(response.body)) if response.code == '200'
    end
  rescue StandardError => e
    puts e
  end

  def build_openai_profile
    response = ResumeParser.new(resume).openai_parse if candidate.first_resume?
    candidate.openai_build_profile(response) if response.present?
  rescue StandardError => e
    puts e
  end

  def build_sovren_profile
    if candidate.first_resume?
      response = ResumeParser.new(resume).sovren_parse
      if response.code == '200'
        parsed_hash = JSON.parse(JSON.parse(response.body)['Value']['ParsedDocument'])['Resume']
        candidate.sovren_build_profile(parsed_hash)
      end
    end
  rescue StandardError => e
    puts e
  end
end
