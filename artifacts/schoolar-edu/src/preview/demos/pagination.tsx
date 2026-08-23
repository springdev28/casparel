/**
 * @fileOverview Design-system role: implements or demonstrates Pagination in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '../../components/ui/pagination';

export function PaginationDemo() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#page=pagination" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#page=pagination">1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#page=pagination" isActive>
              2
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#page=pagination" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
