module JobsHelper

  def find_match_candidates(job)
    user_list = []
    job_skills = job.tags.pluck(:name)
    if job_skills.nil?
      return ""
    else
      count = (job_skills.count * 60 / 100.00).ceil
      current_company.candidates.each do |c|
        user_list.push(c.full_name) if (job_skills & c.skills.pluck(:name)).count >= count
      end
      user_list.join(", ")
    end
  end

end
