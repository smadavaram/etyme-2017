# frozen_string_literal: true

class Company::JobReceivesController < Company::BaseController
  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'Received Job(s)'

    @received_jobs = current_company.sent_job_invitations.where(sender_type: 'Candidate')
  end

  def destroy
    SharedCandidate.where(id: params[:id]).destroy_all
    flash[:notice] = ' Removed received candidate succeffully.'
    redirect_to company_job_receives_path
  end
end
