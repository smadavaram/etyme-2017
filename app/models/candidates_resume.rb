class CandidatesResume < ApplicationRecord
  belongs_to :candidate, optional: true
  after_save :build_profile
  scope :primary_resume, -> { where(is_primary: true).first }

  private

  def build_profile
    begin
      if self.candidate.first_resume?
        response = ResumeParser.new(resume).sovren_parse
        self.candidate.build_profile(JSON.parse(response.body)) if response.code == "200"
      end
    rescue => e
      puts e
    end
  end

end
