if("<%= params[:status] %>" == 'accept' || "<%= params[:status] %>" == 'reject')
{
    $('#ajax-modal').html("<%= j render(partial: 'candidate/contracts/partials/accept_contract_modal' , locals: {job: @job , contract: @contract , status: params[:status]})%>");
    $('#contract-<%= @contract.id %>').modal('show');
}
else
{
    alert("<%= params[:status] %>");

    flash_error('Error!');}