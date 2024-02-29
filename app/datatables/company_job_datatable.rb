class CompanyJobDatatable < ApplicationDatatable
  include BullettrainHelper
  include ApplicationHelper
  
  def_delegator :@view, :job_path
  def_delegator :@view, :company_user_profile_path
  def_delegator :@view, :company_conversations_path
  def_delegator :@view, :send_invitation_job_path
  def_delegator :@view, :job_create_multiple_for_candidate_path
  def_delegator :@view, :edit_job_path

  def view_columns
    @view_columns ||= {
      id:         { source: "Job.id" },
      title:      { source: "Job.title" },
      category:   { source: "Job.job_category" },
      end_date:  { source: "Job.end_date", searchable: false, orderable: false},
      location:   { source: "Job.location" },
      posted_by: { source: "User.full_name", cond: :like, searchable: false, orderable: true },
      status:     { source: "Job.status", searchable: false, orderable: false },
      actions:    { source: "Job.actions", sortable: false, searchable: false }
    }
  end

  def data
    records.map do |record|
      {
        id:         record.id,
        title:      title(record),
        category:   record.job_category,
        end_date:  end_date(record),
        location:   record.location,
        posted_by:  posted_by(record),
        status:     status(record),
        actions:    actions(record)
      }
    end
  end

  def get_raw_records
    type = @params[:type] || 'Job'
    current_company.jobs.where(listing_type: type).not_system_generated.includes(:created_by).joins(:created_by).order(created_at: :desc)
  end  

  def title(job)
    link_to do_ellipsis(job.title,20), job_path(job)
  end

  def end_date(job)
    colorfull_text(display_date(job.end_date || Time.now),'#1AAE9F')
  end

  def posted_by(job)
    link_to job.created_by.full_name, company_user_profile_path(job.created_by) if job.created_by.present?
  end

  def status(job)
    colorfull_text(job.status, job.status == 'Published' ? '#1AAE9F' : 'orange')
  end

  def actions(job)
    actions_html = ''

    if job.conversation.present? || job.create_job_conversation
      actions_html += link_to(company_conversations_path(conversation: job.conversation.id), class: 'data-table-icons btn btn-link btn-sm m-0 p-0') do
        '<i class="fa fa-comment-o"></i>'.html_safe
      end
    end

    if has_permission?("manage_job")
      actions_html += link_to(edit_job_path(job, type: job.listing_type), class: 'data-table-icons btn btn-link btn-sm m-0 p-0') do
        '<i class="fa fa-edit"></i>'.html_safe
      end
      actions_html += link_to(job_create_multiple_for_candidate_path(job), remote: true, class: 'data-table-icons btn btn-link btn-sm m-0 p-0') do
        image_tag('groups.png', size: '16x16', class: '').html_safe
      end
    end

    if has_permission?("send_job_invitations")
      actions_html += link_to(send_invitation_job_path(job), method: :post, remote: true, class: 'data-table-icons btn btn-link btn-sm m-0 p-0') do
        '<i class="dashicons dashicons-external"></i>'.html_safe
      end
    end

    if has_permission?("manage_job")
      actions_html += link_to(job_path(job), method: :delete, data: { confirm: "Are you sure you want to delete this listing?" }, class: 'data-table-icons btn btn-link btn-sm m-0 p-0 text-danger') do
        '<i class="fa fa-trash"></i>'.html_safe
      end
    end

    actions_html.html_safe
  end  
end
