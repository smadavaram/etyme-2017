class CandidateJobMatchWorker
  include Sidekiq::Worker

  def perform(id, type)
    puts 'WORKER STARTED.'
    if type == 'Job'
      find_matched_candidates_for_job(id)
    elsif type == 'Candidate'
      find_matched_jobs_for_candidate(id)
    end
  end
  
  def find_matched_jobs_for_candidate(id)
    Candidate.find(id).matched_jobs
  end
  
  def find_matched_candidates_for_job(id)
    Job.find(id).matched_candidates
  end
end
