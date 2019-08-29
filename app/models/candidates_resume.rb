class CandidatesResume < ApplicationRecord
  belongs_to :candidate, optional: true
  # after_save :build_archilli_profile
  after_save :build_sovren_profile
  scope :primary_resume, -> { where(is_primary: true).first }


  def build_archilli_profile
    begin
      if self.candidate.first_resume?
        response = ResumeParser.new(resume).binary_parse
        self.candidate.build_profile(JSON.parse(response.body)) if response.code == "200"
      end
    rescue => e
      puts e
    end
  end



  def build_sovren_profile
    begin
      if self.candidate.first_resume?
        response = ResumeParser.new(resume).sovren_parse
        if response.code == "200"
          parsed_hash = JSON.parse(JSON.parse(response.body)["Value"]["ParsedDocument"])["Resume"]
          candidate.sovren_build_profile(parsed_hash)
        end
      end
    rescue => e
      puts e
    end
  end

end
