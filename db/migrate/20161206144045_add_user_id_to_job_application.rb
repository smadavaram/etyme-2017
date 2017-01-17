class AddUserIdToJobApplication < ActiveRecord::Migration
  def change
    add_column :job_applications, :user_id, :integer
    add_column :job_applications, :job_id, :integer
  end
end
