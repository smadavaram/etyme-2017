module SovrenCandidateProfileBuilder
  extend ActiveSupport::Concern

  def sovren_build_profile(parsed_resume)
    sovren_update_basic_info(parsed_resume.dig("StructuredXMLResume", "ContactInfo", "ContactMethod"))
    sovren_update_education(parsed_resume.dig("StructuredXMLResume", "EducationHistory", "SchoolOrInstitution"))
    sovren_update_experience(parsed_resume.dig("StructuredXMLResume", "EmploymentHistory", "EmployerOrg"))
    sovren_update_skill_list(parsed_resume.dig("UserArea"))
  end

  private

  def sovren_update_skill_list(user_area)
    return unless user_area
    user_area.extend Hashie::Extensions::DeepFind
    self.update_attribute(:skill_list, user_area.deep_find("sov:Skill").map { |skill| skill["@name"] }.sample(8).join(','))
  end

  def sovren_update_basic_info(parsed_resume)
    return unless parsed_resume
    parsed_resume.extend Hashie::Extensions::DeepFind
    self.update(
        phone: parsed_resume.deep_find("FormattedNumber"),
        address: parsed_resume.deep_find("AddressLine")&.join(',')
    )
  end

  def sovren_update_education(educations)
    return unless educations
    educations&.each do |education|
      self.educations.build(degree_title: education.dig("Degree")&.first.dig("DegreeName"),
                            start_year: sovren_extract_date(education.dig("Degree")&.first&.dig("DatesOfAttendance")&.first&.dig("StartDate")&.first&.second),
                            completion_year: sovren_extract_date(education["Degree"]&.first&.dig("DatesOfAttendance")&.first&.dig("EndDate")&.first&.second),
                            institute: education["School"]&.first&.dig("SchoolName"),
                            degree_level: education.dig("@schoolType"),
                            grade: "#{education["Degree"]&.first&.dig("DegreeMeasure","EducationalMeasure","MeasureValue")&.first&.second} #{education.dig("Degree")&.first&.dig("DegreeMeasure","EducationalMeasure","MeasureSystem")}"

      ).save
    end
  end

  def sovren_update_experience(experiences)
    return unless experiences
    experiences&.each do |experience|
      self.designations.build(
          comp_name: experience.dig("EmployerOrgName"),
          start_date: sovren_extract_date(experience.dig("PositionHistory")&.first&.dig("StartDate")&.first&.second),
          end_date: sovren_extract_date(experience.dig("PositionHistory")&.first&.dig("EndDate")&.first&.second),
          company_role: experience.dig("PositionHistory")&.first&.dig("Title")
      ).save
      self.update(designation_status: "Employee") if self.designation_status.nil?
    end
  end

  def sovren_extract_date(date)
    begin
      return Chronic.parse(date)
    rescue
      return nil
    end
  end

end
