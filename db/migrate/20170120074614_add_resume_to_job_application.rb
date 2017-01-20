class AddResumeToJobApplication < ActiveRecord::Migration
  def change
    add_column :job_applications, :resume, :string
  end
end
