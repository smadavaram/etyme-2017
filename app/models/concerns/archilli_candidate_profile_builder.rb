# frozen_string_literal: true

module ArchilliCandidateProfileBuilder
  extend ActiveSupport::Concern

  def build_profile(parsed_resume)
    update_basic_info(parsed_resume['ResumeParserData'])
    update_education(parsed_resume['ResumeParserData']['SegregatedQualification']['EducationSplit'])
    update_experience(parsed_resume['ResumeParserData']['SegregatedExperience']['WorkHistory'])
  end

  private

  def update_basic_info(parsed_resume)
    update(dob: extract_date(parsed_resume['DateOfBirth']),
           passport_number: parsed_resume['PassportNo'],
           phone: parsed_resume['Phone'],
           address: parsed_resume['Address'],
           skill_list: get_skills(parsed_resume['SkillKeywords']['SkillSet']))
  end

  def update_education(educations)
    educations&.each do |education|
      self.educations.build(degree_title: education['Degree'],
                            start_year: extract_date(education['StartDate']),
                            completion_year: extract_date(education['EndDate']),
                            institute: education['Institution']['Name'],
                            degree_level: education['Institution']['Type'],
                            grade: "#{education['Aggregate']['Value']}  #{education['Aggregate']['MeasureType']}").save
    end
  end

  def update_experience(experiences)
    experiences&.each do |experience|
      designations.build(
        comp_name: experience['Employer'],
        start_date: extract_date(experience['StartDate']),
        end_date: extract_date(experience['EndDate']),
        company_role: experience['JobProfile']['Title']
      ).save
      update(designation_status: 'Employee') if designation_status.nil?
    end
  end

  def extract_date(date)
    Date.parse(date)
  rescue StandardError
    nil
  end

  def get_skills(skills)
    pick_skills = []
    skills.each do |skill|
      pick_skills << skill['Skill']
    end
    pick_skills.sample(8).join(',')
  end
end
