class AddMinHourlyRateToJobInvitation < ActiveRecord::Migration[5.1]
  def change
    add_column :job_invitations, :min_hourly_rate, :integer
    add_column :job_invitations, :max_hourly_rate, :integer
  end
end
