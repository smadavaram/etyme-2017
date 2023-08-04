# frozen_string_literal: true

module OpenaiCandidateProfileBuilder
  extend ActiveSupport::Concern

  def openai_build_profile(parsed_resume)
    openai_update_flname_info(parsed_resume['first_name'], parsed_resume['last_name'])
    openai_update_basic_info(parsed_resume['phone_number'], parsed_resume['address'], parsed_resume['birthdate'])
    openai_update_education(parsed_resume['education'])
    openai_update_experience(parsed_resume['work_history'])
    openai_update_skill_list(parsed_resume['skills'])
  end

  private

  def openai_update_flname_info(given_name, surname)
    return if given_name.blank? && surname.blank?

    attributes = {}
    attributes[:first_name] = given_name if given_name.present?
    attributes[:last_name] = surname if surname.present?
    update(attributes)
  end

  def openai_update_basic_info(phone_number, full_address, birthdate)
    return if phone_number.blank? && full_address.blank? && birthdate.blank?

    attributes = {}
    attributes[:address] = full_address if full_address.present?
    attributes[:phone] = phone_number if phone_number.present?
    attributes[:dob] = birthdate if birthdate.present?

    update(attributes)
  end

  def openai_update_education(educations)
    return if educations.blank?

    educations&.each do |education|
      self.educations
          .build(degree_title: education['degree_type'],
                 start_year: openai_extract_date(education['start_date']),
                 completion_year: openai_extract_date(education['end_date']),
                 institute: education['school_name'],
                 degree_level: education['school_type'],
                 grade: education['grade'])
          .save
    end
  end

  def openai_update_experience(experiences)
    return if experiences.blank?

    experiences&.each do |experience|
      clients.build(project_description: experience['description'],
                    name: experience['company'],
                    start_date: openai_extract_date(experience['start_date']),
                    end_date: openai_extract_date(experience['end_date']),
                    role: experience['job_title'])
             .save
      update(ever_worked_with_company: 'Yes') if [nil, 'No'].include?(ever_worked_with_company)
    end
  end

  def openai_update_skill_list(skills)
    return if skills.blank?

    update_attribute(:skill_list, skills.join(', '))
  end

  def openai_extract_date(date)
    Chronic.parse(date)
  rescue StandardError
    nil
  end
end
